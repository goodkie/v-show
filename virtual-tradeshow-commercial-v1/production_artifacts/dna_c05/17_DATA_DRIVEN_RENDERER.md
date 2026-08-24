# 17_DATA_DRIVEN_RENDERER.md — Photo Immersive Master Data-Driven Engine Architecture

## 1. Engine Concept & Reusability
Instead of manually editing hardcoded static HTML files for every customer, the **Photo Immersive Master Renderer** is dynamic:

```
[PROJECT MANIFEST (JSON)]
   ├── Company Profile & Branding
   ├── Spatial Views (2K/8K/16K Panoramas)
   ├── Product Pinpoints (Normalized / World Coordinates)
   ├── Products Registry & Specifications
   └── Buyer Tools Configuration
             │
             ▼
[PhotoImmersiveEngine (photo-engine.js)]
   ├── Three.js WebGL Inverted Equirectangular Sphere
   ├── ACES Filmic Tone Mapping & High-DPI Filtering
   ├── Raycaster & Canvas Pinpoint Projection Layer
   ├── Dynamic Product Inspection Drawer (4K Image + Specs + Buyer Actions)
   └── Visual Pinpoint Creation Mode (Click to Add Pinpoint)
             │
             ▼
[ACTIVE CUSTOMER BOOTH (Desktop & Mobile Portrait)]
```

## 2. API Contract
- `GET /api/projects/:id/manifest`: Fetches the complete project data manifest.
- `POST /api/projects/:id/pinpoints`: Dynamically adds a new pinpoint.
- `GET /photo-viewer.html?project={projectId}`: Embeddable / standalone viewer.
