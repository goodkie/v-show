# 04_VIEWER_CALL_GRAPH — Precision Splat Viewer 런타임 콜그래프
(Phase 10.7N-R6 Viewer Architecture Audit)

---

## 1. 정밀 콜그래프 (Exact Call Graph)

```
wilo-demo.html (Line 610)
    │
    ▼
PrecisionSplatViewer constructor (precision-viewer.js: Line 8)
    │
    ▼
precisionViewer.load(assetMetadata) (precision-viewer.js: Line 63)
    │
    ├── [1] fetch('/assets/demo/wilo/models/REAL_WILO_GAUSSIAN_FINAL.spz')
    │        └── Network response (111,539,801 Bytes ArrayBuffer)
    │
    ├── [2] importSparkModule() (precision-viewer.js: Line 183)
    │        └── Loads Spark 2.1.0 WebGL2 Engine (window.Spark)
    │
    ├── [3] Spark.SparkRenderer({ renderer }) (precision-viewer.js: Line 123)
    │        └── Attached to Three.js Scene as 'SparkRendererInstance'
    │
    ├── [4] new Spark.SplatMesh({ fileBytes, fileType: 1, maxSplats }) (precision-viewer.js: Line 137)
    │        └── GPU Shader / Radiance Ellipsoid Buffer Decoder (526,941 Splats)
    │
    ├── [5] this.scene.add(this.splatMesh) (precision-viewer.js: Line 159)
    │        └── Added to Three.js Scene as 'PrecisionSplatBooth'
    │
    └── [6] animate() -> renderer.render(scene, camera) (wilo-demo.html: Line 650)
             └── Native WebGL2 GPU Splat Sorting & Radiance Rasterization
```

---

## 2. 세부 검증 항목 질의응답 (Audit Q&A)

1. **Which URL it fetches**:
   - `/assets/demo/wilo/models/REAL_WILO_GAUSSIAN_FINAL.spz`
2. **Whether response bytes are passed into a real SPZ decoder**:
   - **YES**. Response `arrayBuffer` (111,539,801 Bytes) is directly passed to `new Spark.SplatMesh({ fileBytes: arrayBuffer })`.
3. **Which library performs decoding**:
   - `@sparkjsdev/spark` 2.1.0 (`Spark.SplatMesh`).
4. **Which object is created from decoded data**:
   - `Spark.SplatMesh` instance (Named `'PrecisionSplatBooth'`).
5. **Which object is inserted into the WebGL scene**:
   - `this.splatMesh` (`PrecisionSplatBooth`) & `SparkRendererInstance`.
6. **Whether another scene/model is rendered instead**:
   - **NO**. In `gaussian3d` mode, `buildWiloShowroom(scene)` is bypassed.
7. **Whether PHOTO_TOUR imagery is being displayed behind/over the canvas**:
   - **NO**. Photo tour container is hidden in `gaussian3d` mode.
8. **Whether SMART FACTORY geometry is hardcoded in `wilo-demo.html`**:
   - **NO**. The visual content originates entirely from the encoded Gaussian ellipsoids inside `REAL_WILO_GAUSSIAN_FINAL.spz`.
