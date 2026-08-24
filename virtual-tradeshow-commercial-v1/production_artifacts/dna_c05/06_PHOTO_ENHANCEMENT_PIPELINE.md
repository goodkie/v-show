# 06_PHOTO_ENHANCEMENT_PIPELINE.md — Photo Enhancement & Derivative Generation

## 1. Proven Enhancement Pipeline Architecture
The enhancement pipeline reuses the visual preparation methods identified in the reference master (`generate_clean_matterport.js`):

```
RAW BOOTH PHOTO (Original Preserved)
       │
       ▼
1. GEOMETRY & PROJECTION NORMALIZATION
   - Equirectangular 2:1 bounding & leveling
   - Seam smoothing (360° wrapping)
       │
       ▼
2. TONE MAPPING & COLOR GRADING
   - ACES Filmic Tone Mapping curve
   - Exhibition hall lighting neutralization (specular glare suppression)
   - Dynamic range balance (1.18 exposure factor)
       │
       ▼
3. MULTI-RESOLUTION PYRAMID DERIVATIVES
   ├── 2K Preview Texture (2048 × 1024) -> Instant initial load
   ├── 8K High-Detail (8192 × 4096)      -> Standard desktop / mobile
   └── 16K Master Detail (16384 × 8192)  -> High-DPI / Zoom inspection
```

## 2. Immutability & Traceability Rules
- The raw uploaded file is permanently preserved in `booth/original/`.
- Enhanced files are placed in `booth/enhanced/` with tracking headers:
  - `sourceAssetId`, `derivedAssetId`, `processingMethod`, `processedAt`, `processedBy`.
