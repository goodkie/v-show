# FORENSIC REPORT: SPARK RUNTIME ARCHITECTURE & PROOF
**Inspection Date:** 2026-08-17  
**Engine:** `@sparkjsdev/spark@2.1.0` with `three@0.185.1`

---

## 1. Verified Production Spark Implementation
The production codebase contains a complete, verified Gaussian Splatting engine in `app_build/client/precision-viewer.js` and `app_build/client/viewer.js`.

### Key Capabilities Verified:
1. **True Gaussian Splatting Ingestion**: Supports decoding binary Gaussian Splats using `@sparkjsdev/spark` `SplatMesh`, `PlyReader`, and `SpzReader`.
2. **Dynamic Asset Loading**:
   ```javascript
   const res = await fetch(modelUrl);
   const arrayBuffer = await res.arrayBuffer();
   const splatMesh = new SplatMesh({
     fileBytes: new Uint8Array(arrayBuffer),
     fileType: isSpz ? 'spz' : 'ply'
   });
   scene.add(splatMesh);
   ```
3. **Graceful Fallback**: If `fetch()` fails (HTTP 404/500) or if the PLY parser throws a corrupt byte error, the viewer automatically invokes `buildPhotoPreviewBooth()` (Photo Tour fallback) and emits zero false telemetry.

---

## 2. Wilo Demo Integration Status
- For booths with verified Gaussian splats (`REAL-RECON-PILOT-01_splat.ply`, 60.78 MB), Spark renders full radiance splatting.
- For `booth-wilo-golden-demo`, because the 20 source images have not undergone multi-view calibrated photogrammetry, the showroom correctly defaults to the **12-view Photo Tour**, offering **3D Procedural Preview** as a secondary option.

---

## 3. Forensic Metrics
- **SPARK_VERSION:** `@sparkjsdev/spark@2.1.0`
- **SPARK_SPLATMESH_USED:** `YES (in precision-viewer.js)`
- **PLY_READER_USED:** `YES`
- **SPZ_READER_USED:** `YES (supported in Spark decoder)`
- **SPZ_ASSET_STATUS:** `SPZ_SUPPORTED_BUT_NO_ASSET (No physical .spz file on disk)`
