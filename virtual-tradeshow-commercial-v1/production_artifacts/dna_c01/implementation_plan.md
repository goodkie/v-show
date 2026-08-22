# Implementation Plan — Phase 10.7N-E: Wilo True 3D Reconstruction + Real Upload Repair

Upgrade the Wilo Golden Demo from a simulated Canvas 3D / Photo Tour to a genuine, navigable 3D virtual showroom experience with tenant-isolated multi-image uploads, true 3D scene rendering, walkthrough mode, world-space 3D hotspots, GLB product 3D viewer, and comprehensive fallback architectures.

---

## User Review Required

> [!IMPORTANT]
> **Zero Simulation & Truthful Reconstruction Standard**:
> - 20 physical images in `E:\vivpr\ai\v-show\source\cropped-images` will be audited with exact byte counts, dimensions, MIME types, and SHA-256 hashes.
> - All uploads will be stored under tenant-isolated directories: `DATA_DIR/uploads/organizations/{organizationId}/booths/{boothId}/captures/{captureId}/images/`.
> - If 3D reconstruction / WebGL encounters any failure, the system automatically falls back to `PHOTO_TOUR` mode.
> - Billing safety invariants (`STRIPE_MODE=test`, `stripeLiveBillingEnabled=false`, `billingKillSwitch=true`, `REAL_MRR=$0`, `ACTUAL_CASH=$0.00`) are strictly preserved.

---

## Proposed Changes

### 1. Source Image Audit & Manifest (`production_artifacts/wilo_reconstruction/`)
- Audit all files in `E:\vivpr\ai\v-show\source\cropped-images`.
- Generate `SOURCE_IMAGE_MANIFEST.json` and `SOURCE_IMAGE_QA.md`.
- Inspect dimensions, MIME, bytes, SHA-256, blur, and geometric matchability.

### 2. Upload Engine & Storage Architecture (`server/index.js`, `server/db.js`)
- [MODIFY] `server/index.js`:
  - Implement tenant-isolated capture upload API: `POST /api/booths/:id/captures/upload` with multer disk storage targeting `DATA_DIR/uploads/organizations/{orgId}/booths/{boothId}/captures/{captureId}/images/`.
  - Validate magic bytes / MIME types (JPEG, PNG, WEBP), sanitize filenames, reject path traversals, executables, double extensions.
  - Implement capture dataset management: `GET /api/booths/:id/captures`, `DELETE /api/booths/:id/captures/:captureId/images/:filename`.
  - Implement 3D model asset serving and product GLB uploads: `POST /api/products/:id/model-3d`.
- [MODIFY] `server/db.js`:
  - Add capture dataset tracking (`db.captures`), reconstruction preflight analytics, 3D scene configurations (camera FOV, target, orbit bounds, walk speed, lighting).
  - Add product 3D model metadata tracking (`glbUrl`, `meshStats`, `format`).

### 3. Frontend Multi-Image Upload & Admin 3D Settings (`client/admin.html`, `client/admin.js`)
- [MODIFY] `client/admin.html`:
  - Enhance Capture / Reconstruction tab with multi-file drag-and-drop, per-file upload progress, thumbnail grid with delete/replace/reorder, and capture dataset QA summary.
  - Add 3D Scene Settings panel (Camera FOV, Walk speed, default view, lighting, background).
  - Add Product 3D model upload/preview controls in Product Editor.
- [MODIFY] `client/admin.js`:
  - Support multi-file batch upload (20+ files) with live progress bar and retry.
  - Connect 3D scene parameters and product 3D model management.

### 4. True 3D Showroom & Walkthrough Viewer (`client/wilo-demo.html`, `client/precision-viewer.js`, `client/booth-engine.js`)
- [MODIFY] `client/wilo-demo.html`:
  - Integrate genuine Three.js / Precision 3D Gaussian Splatting engine.
  - Add dual navigation modes: **ORBIT** (drag orbit, pinch/wheel zoom) and **WALK** (WASD / arrow keys + mobile touch virtual joystick, eye-level collision plane).
  - World-space 3D spatial hotspots anchored to 3D coordinates `(x, y, z)` with raycasting / billboarding.
  - Interactive GLB / 3D product inspection modal replacing 2D canvas rotation.
  - Explicit mode switcher: `Explore in 3D` / `Photo Tour`.
  - Automatic graceful fallback to `PHOTO_TOUR` on WebGL failure or network drop.

### 5. Automated Acceptance Suite & Artifacts
- [NEW] `scripts/test_phase10_7n_e_wilo_true3d.js`: End-to-end test suite testing upload, validation, tenant isolation, 3D viewer, fallback, security, and Stripe invariants.
- [NEW] `production_artifacts/PHASE_10_7N_E_WILO_TRUE_3D.md` & `production_artifacts/wilo_reconstruction/*`.

---

## Verification Plan

### Automated Tests
- Run `node scripts/test_phase10_7n_e_wilo_true3d.js`
- Test assertions:
  1. 20 source images audit & manifest integrity
  2. Multi-image upload API with tenant isolation
  3. Security checks (cross-tenant rejection, double extensions, MIME filtering)
  4. Reconstruction preflight & capture QA rules
  5. 3D viewer & fallback mechanics
  6. Product 3D model management
  7. English-only customer UI scan (0 Hangul)
  8. Billing safety invariants (`STRIPE_MODE=test`, `LIVE_BILLING=OFF`, `REAL_MRR=$0`)

### Production & Endpoint Verification
- Local dev server validation: `http://localhost:3000/health`, `http://localhost:3000/wilo-demo.html`, `http://localhost:3000/admin.html`
- Git commit & push to `goodkie/v-show` master
- Railway deployment verification
