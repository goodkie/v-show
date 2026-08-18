# 03 WILO DATABASE MAPPING REPORT

| Entity | Database ID | Asset Count | Model Reference | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Organization** | `org-wilo-golden-demo` | 1 Org Profile | N/A | **ACTIVE** |
| **Booth** | `booth-wilo-golden-demo` | 12 Booth Views | `REAL_WILO_GAUSSIAN_FINAL` | **PUBLISHED** |
| **Products** | `prod-wilo-01` ~ `prod-wilo-08` | 8 Products | Procedural 3D Inspection | **ACTIVE** |
| **Hotspots** | `hs-wilo-01` ~ `hs-wilo-08` | 8 Spatial Anchors | Linked to 8 Products | **ACTIVE** |
| **Gaussian 3D Model** | `WILO-GEOMETRY-60-01` | 526,941 Gaussians | PLY (130.7 MB), SPZ (111.5 MB) | **QUALIFIED GOLD** |
