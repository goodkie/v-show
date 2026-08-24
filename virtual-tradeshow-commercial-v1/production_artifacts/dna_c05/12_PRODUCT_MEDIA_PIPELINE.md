# 12_PRODUCT_MEDIA_PIPELINE.md — Product Media Optimization Pipeline

## 1. Automated Media Processing
When product images or spec sheets are uploaded:
1. **Pristine Archival**: Stored untouched in `products/{productId}/original/`.
2. **Web Optimization**:
   - `Hero Image`: Compressed to WebP / JPEG (1200×1200 max) for crisp high-DPI product drawers.
   - `Pinpoint Capsule Thumbnail`: Ultra-sharp 128×128 thumbnail for in-viewer floating capsule markers.
   - `QR Code`: Vector SVG & high-res PNG for line sheets and print displays.
3. **Optional 3D Assets**:
   - GLB or Three.js procedural proxy preview for 360° interactive turntable inspection inside the product drawer.
