# FORENSIC AUDIT: CURRENT WILO VIEWER RENDER PATH
**Investigation Date:** 2026-08-17  
**Module:** `app_build/client/wilo-demo.html`, `app_build/server/index.js`

---

## 1. Executive Forensic Findings

An exact line-by-line inspection of `app_build/client/wilo-demo.html` (and the corresponding `WILO_DEMO_HTML` in `server/index.js`) reveals that the primary 3D viewport was rendering **procedural Three.js primitives** rather than loading and decoding the physical Wilo reconstruction asset (`wilo_golden_booth_splat.ply`).

```
PROCEDURAL_GEOMETRY_PRESENT = yes (THREE.BoxGeometry, THREE.CylinderGeometry, THREE.TorusGeometry, THREE.PlaneGeometry)
SPARK_SPLAT_LOADER_PRESENT = no (wilo-demo.html did not instantiate SplatMesh or SparkRenderer)
PLY_FETCH_PRESENT = no (No fetch call for .ply file in wilo-demo.html)
SPZ_FETCH_PRESENT = no (No fetch call for .spz file in wilo-demo.html)
CURRENT_PRIMARY_RENDERER = PROCEDURAL_THREEJS_GEOMETRY
```

---

## 2. Code Evidence

### A. Procedural Booth Construction (`client/wilo-demo.html:362-398`)
```javascript
function buildWiloShowroom(scene) {
  // Floor
  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  scene.add(floor);

  // Main Back Wall (White with Wilo Header)
  const backWallGeo = new THREE.BoxGeometry(12, 4.5, 0.3);
  const backWall = new THREE.Mesh(backWallGeo, backWallMat);
  scene.add(backWall);

  // LED Video Display Wall
  const screenGeo = new THREE.PlaneGeometry(3.6, 3.2);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  scene.add(screen);

  // Curved Wilo Teal Reception Counter
  const counterGeo = new THREE.CylinderGeometry(2.4, 2.4, 1.0, 32, 1, false, 0, Math.PI);
  const counter = new THREE.Mesh(counterGeo, counterMat);
  scene.add(counter);

  // Central Display Pedestal Tables
  const tableGeo = new THREE.BoxGeometry(6.5, 0.8, 1.2);
  const table = new THREE.Mesh(tableGeo, tableMat);
  scene.add(table);

  // Overhead Curved Truss & Signage
  const trussGeo = new THREE.TorusGeometry(4.5, 0.12, 8, 32, Math.PI * 0.9);
  const truss = new THREE.Mesh(trussGeo, trussMat);
  scene.add(truss);
}
```

### B. Procedural Product 3D Inspection (`client/wilo-demo.html:482-520`)
```javascript
function initProduct3DCanvas(product) {
  // Constructed via CylinderGeometry, BoxGeometry, TorusGeometry
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 24);
  const motorGeo = new THREE.BoxGeometry(0.5, 0.45, 0.45);
  const flangeGeo = new THREE.TorusGeometry(0.4, 0.08, 12, 24);
}
```

---

## 3. Forensic Classification
- **Primary Viewport State:** `PROCEDURAL_3D_DETECTED`
- **Action Required:**
  1. Remove misleading claims of "Full Radiance Showroom" or "True 3D Gaussian Reconstruction" from UI.
  2. Relabel procedural 3D elements strictly as `3D Procedural Preview`.
  3. Wire the real Splat viewer pipeline (`precision-viewer.js`) where valid Gaussian splats exist.
  4. Ensure Photo Tour is clearly presented as the primary photorealistic walkthrough.
