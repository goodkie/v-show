# 02. ARTIFACT CLASSIFICATION & INDEX

## 1. Classification Methodology
- **VERIFIED_BY_CODE**: Confirmed by executable JavaScript/Node.js logic and schemas.
- **VERIFIED_BY_RUNTIME**: Confirmed by live HTTP 200 responses and ONNX Runtime execution.
- **DOCUMENTED_ONLY**: Design specifications and policy guidelines without active blocking gates.
- **STALE**: Historical artifacts superseded by subsequent milestone corrections.
- **CONTRADICTORY**: Conflicting historical claims corrected by forensic audits.

## 2. Milestone Classification Table
| Artifact Group | Path | Status Classification | Notes |
| :--- | :--- | :--- | :--- |
| **C11.5 / V4.2 Mastering** | `production_artifacts/3dna_ai_image_mastering_v4_2/` | **VERIFIED_BY_RUNTIME** | Real ONNX execution, 7680x4320 PNG generated |
| **C11.4 / V4.1 Audit** | `production_artifacts/3dna_ai_image_mastering_v4_1_audit/` | **VERIFIED_BY_CODE** | Corrected status to `PARTIALLY_VERIFIED_CORRECTIONS_REQUIRED` |
| **C11.3 Commercial Pricing** | `production_artifacts/3dna_c11_3/` | **VERIFIED_BY_CODE** | $299 PRO, $799 BUSINESS, CUSTOM quote |
| **C11.2 AI Makeup Showcase** | `production_artifacts/3dna_c11_2/` | **VERIFIED_BY_CODE** | Video playback hardened, status `CONSULTATION` |
| **C11.1 AI Fitting Room** | `production_artifacts/3dna_c11_1/` | **VERIFIED_BY_CODE** | Consultation modal bound, status `CONSULTATION` |
| **C11 Stripe Pipeline** | `production_artifacts/3dna_c11/` | **VERIFIED_BY_CODE** | Safe test mode, `PAYMENT_PILOT_ARMED=false` |
| **C10-R3 Security Baseline** | `production_artifacts/3dna_c10_r3/` | **VERIFIED_BY_CODE** | Duplicate prevention, hash-based IP privacy |
| **Wilo Reconstruction R&D** | `production_artifacts/wilo_*` | **DOCUMENTED_ONLY** | Isolated R&D multi-view dataset |
