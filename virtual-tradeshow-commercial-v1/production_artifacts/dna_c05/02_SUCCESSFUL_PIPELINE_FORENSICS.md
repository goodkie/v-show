# 02_SUCCESSFUL_PIPELINE_FORENSICS.md — Forensics of the Reference Photo Immersive Pipeline

## 1. Executive Summary & Forensic Audit
A rigorous forensic audit of the master branch pipeline that produces the reference experience (`/demo-matterport.html`) was conducted by analyzing source assets, image headers, generator scripts, and WebGL runtime shaders.

---

## 2. Actual Source Asset Resolutions & Characteristics

### A. Source Image Files on Disk
Path: `app_build/client/assets/demo/dna-showcase/pano360/`

| Filename | File Size | Actual Measured Resolution | Aspect Ratio | Format |
| :--- | :--- | :--- | :--- | :--- |
| `node0_preview.jpg` | 0.32 MB | **2048 × 1024** | 2:1 | JPEG (sRGB) |
| `node1_preview.jpg` | 0.30 MB | **2048 × 1024** | 2:1 | JPEG (sRGB) |
| `node2_preview.jpg` | 0.35 MB | **2048 × 1024** | 2:1 | JPEG (sRGB) |
| `node0_360_panorama_8k.jpg` | 3.71 MB | **8192 × 4096** | 2:1 | JPEG (Equirectangular) |
| `node1_360_cobots_8k.jpg` | 4.19 MB | **8192 × 4096** | 2:1 | JPEG (Equirectangular) |
| `node2_360_amr_8k.jpg` | 4.58 MB | **8192 × 4096** | 2:1 | JPEG (Equirectangular) |
| `node1_360_cobots_16k.jpg` | 8.17 MB | **16384 × 8192** | 2:1 | JPEG (Equirectangular Master) |
| `node2_360_amr_16k.jpg` | 8.77 MB | **16384 × 8192** | 2:1 | JPEG (Equirectangular Master) |

### B. Forensic Answer to the "64K" Claim
- `SOURCE_IMAGE_NATIVE_RESOLUTION`: **8192 × 4096 (8K)** / **16384 × 8192 (16K)**
- `PROCESSED_IMAGE_RESOLUTION`: **8192 × 4096 (8K)** / **16384 × 8192 (16K)**
- `VIEWER_TEXTURE_RESOLUTION`: WebGL hardware capability clamped (`8192 × 8192` or `16384 × 16384`)
- `PANORAMA_RESOLUTION`: **16384 × 8192** (Highest active texture)
- `OUTPUT_RESOLUTION`: Viewport resolution (e.g. `1920 × 1080` to `3840 × 2160`)
- **Finding**: The UI string `65536 × 32768 ULTRA-HD` was a conceptual capacity indicator, not the actual native panorama dimension. In dn'a-C05, this unverified numeric claim is **completely removed** in favor of truthful labels (**`Photo Immersive Master Studio`**).

---

## 3. Rendering Engine & Visual Enhancement Pipeline

1. **Geometry Mapping**:
   - Inverted Equirectangular Sphere: `new THREE.SphereGeometry(500, 128, 64);` scaled by `scale(-1, 1, 1)`.
   - Sphere orientation offset: `rotation.y = -Math.PI * 0.5` to align primary trade show booth signage with default camera look-at vector `(0, 0, -1)`.
2. **Color Management & Tone Mapping**:
   - Three.js WebGLRenderer with `sRGBEncoding` output.
   - ACES Filmic Tone Mapping with `exposure = 1.18` for photographic contrast without blown-out specular highlights.
3. **Multi-Node Spatial Navigation**:
   - Progressive texture loading: fast 2K preview loaded first (`nodeX_preview.jpg`), seamless swap to 8K/16K texture upon complete fetch.
   - Smooth animated transition between vantage points using TWEEN.js camera interp and cross-fade.
4. **Pinpoint Placement**:
   - 3D Projected DOM overlays / Three.js Raycaster projecting 3D coordinates `(x, y, z)` into screen space coordinates `(px, py)` on `requestAnimationFrame`.

---

## 4. Productization Path for dn'a-C05
Rather than generating standalone static HTML files for every customer booth, this proven Three.js equirectangular pipeline is encapsulated into the dynamic, data-driven **`PhotoImmersiveEngine`** (`photo-engine.js`) and **`photo-viewer.html`**.
