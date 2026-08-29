# 04. SOURCE CLASSIFICATION GATE

## 1. Taxonomy & Classification Rules
| Source Type | Aspect Ratio / Metadata | Processing Pipeline | Target Output |
| :--- | :--- | :--- | :--- |
| **NORMAL_PHOTO** | 16:9, 4:3, 3:2 Flat Photo | Tight 16:9 Crop → AI SR → 8K Master | 7680×4320 PNG Master |
| **EQUIRECTANGULAR_360** | 2:1 Spherical Projection | 2:1 Geometry Preserved → Spherical Texture | 7096×3548 2:1 Panorama Texture |
| **MULTI_VIEW_PHOTO_SET** | Multiple overlapping angles | Camera calibration → SfM / Multi-View Tour | Multi-View Spatial Nodes |
| **REJECTED_SOURCE** | Blur < 30, Width < 640 | Rejection Gate (0 Allowance Consumed) | User Re-upload Prompt |
