# 07_ASSET_STORAGE_ARCHITECTURE.md — Project Logical Asset Storage

## 1. Directory Structure
All customer assets are isolated per `projectId`:

```
assets/projects/{projectId}/
    ├── booth/
    │   ├── original/          # Raw untouched customer uploads
    │   ├── enhanced/          # ACES-graded multi-res derivatives (2K/8K/16K)
    │   └── published/         # Active production assets
    │
    ├── products/
    │   └── {productId}/
    │       ├── original/      # Pristine product photo upload
    │       ├── optimized/     # WebP thumbnails & 4K inspection photos
    │       ├── gallery/       # Supplementary product angles
    │       ├── downloads/     # Spec sheets / brochures
    │       └── 3d/            # Optional GLB / procedural 3D assets
    │
    ├── catalog/               # Consolidated line sheets / extracted catalogs
    ├── brand/                 # Vector/Raster company logos
    ├── card/                  # Smart Exhibitor Card avatar & vCard assets
    └── revisions/             # Draft snapshots & historical published manifests
```

## 2. Security & Separation
- Draft uploads do not overwrite published assets.
- Assets are referenced via deterministic URIs: `/assets/projects/{projectId}/...`.
