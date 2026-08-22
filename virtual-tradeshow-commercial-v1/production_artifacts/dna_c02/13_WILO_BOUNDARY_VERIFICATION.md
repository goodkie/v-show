# dn’a-C01 — 13 WILO BOUNDARY & R&D ISOLATION REPORT

**Phase**: `dn’a-C01 — COMMERCIAL DEMO & ORDER INTAKE`  
**Wilo Status**: `R10.5 — WAITING_FOR_RECAPTURE_UPLOAD`  
**Parallel Execution Mode**: Strict Physical & Architectural Boundary  

---

## 1. Wilo Showroom Status Verification

- **Page Route**: `/wilo-demo.html`
- **Primary Public Mode**: `[ 📷 Photo Tour (Primary) ]` (Active with 12 real capture views)
- **3D Mode State**: `[ 🌐 3D Reconstruction (Pending) ]` (Displays truthful pending card)
- **Failed Experimental Partial Model**: Completely removed from public showroom UI; restricted to internal `/diagnostics/wilo-partial-experiment-01.html`.
- **Runtime Truth State**:
  ```json
  {
    "tenant": "org-wilo-golden-demo",
    "photoTour": true,
    "partialAuthentic3DPreview": false,
    "fullAuthenticGaussian3D": false,
    "fullReconstructionStatus": "PENDING_ADDITIONAL_REAL_CAPTURE",
    "failedPartialModelPubliclyVisible": false,
    "syntheticFallback": false
  }
  ```

---

## 2. Hard Boundary Rule Compliance

1. `NO_SYNTHETIC_WILO_ASSETS`: **`0 Synthetic Assets Generated`**
2. `NO_INTERPOLATED_WILO_VIEWS`: **`0 Interpolated Views`**
3. `COLMAP_EXECUTED`: **`false`** (No SfM runs during C01)
4. `GAUSSIAN_TRAINING_EXECUTED`: **`false`** (No GPU training during C01)
5. `RECAPTURE_INCOMING_FILES`: **`0 Files`** (Awaiting physical photography)
