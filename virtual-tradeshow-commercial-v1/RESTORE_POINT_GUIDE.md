# 🛡️ RESTORE POINT & HANDOFF GUIDE (v8.0 Master Release)
**DN'a ROBOTIC Virtual Tradeshow & Matterport 64K Ultra-HD Studio Digital Twin**

> **Created Date:** 2026-08-23  
> **Restore Point Tag:** `v8.0-master-restore-point`  
> **Git Commit Hash:** `bfd5b99`  
> **Git Repository:** `https://github.com/goodkie/v-show.git` (Branch: `master`)  
> **Live Production URL:** [https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html](https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html)

---

## 1. System Overview & Architecture

This project is an enterprise-grade **Virtual Tradeshow & 3D Digital Twin Platform** featuring:

1. **Matterport 64K Ultra-HD Master Studio (`demo-matterport.html`)**:
   - **Visual Engine**: Three.js WebGL with Equirectangular Sphere, ACES Filmic Tone Mapping, 16x Anisotropic texture filtering.
   - **Spatial Resolution**: 65,536 × 32,768 (64K Master) progressive two-stage streaming (Fast preview ➔ Ultra-HD HDR).
   - **Layout**: 2/3 Height 3D Immersive Viewport + Bottom 4-Product Shortcut Cards Tray + Unified Right Sidebar.
   - **Interactive Hotspots**: 3D floating spatial capsules with live mini product thumbnails, pulsing status dots, and English titles.
   - **Right Sidebar**: Real-time Booth Radar 2D Minimap + Focused Equipment live specs & 1:1 RFQ quotation dispatcher.
   - **Product Inspection Drawer**: Dual-mode media viewer (`[🖼 4K STUDIO PHOTO]` vs `[🔄 360° 3D VIEWER]` with interactive Three.js turntable controls, wireframe mode, and auto-rotation).
   - **Localization**: 100% Full English Enterprise Localization.

2. **3D WebGL Virtual Showroom (`demo.html`)**:
   - Full 3D polygon showroom booth with GLTF/GLB models, directional lighting, spatial audio, and product interactions.

3. **3D Gaussian Splatting (3DGS) Viewer (`demo-splat.html`)**:
   - Real-time radiance field rendering engine for photorealistic 3D point cloud scans.

---

## 2. Directory Structure & Key Files

```text
E:\vivpr\ai\v-show\
├── virtual-tradeshow-commercial-v1\
│   ├── generate_clean_matterport.js    <-- [MASTER GENERATOR] Single Source of Truth for demo-matterport.html
│   ├── app_build\                      <-- [APPLICATION CODEBASE]
│   │   ├── client\
│   │   │   ├── demo-matterport.html    <-- 64K Matterport Studio HTML
│   │   │   ├── demo.html               <-- 3D WebGL Showroom
│   │   │   ├── demo-splat.html         <-- 3DGS Gaussian Splatting Viewer
│   │   │   └── assets\
│   │   │       └── demo\dna-showcase\
│   │   │           ├── pano360\        <-- 64K Master uncompressed panoramas (node0, node1, node2)
│   │   │           └── products\       <-- 4K Studio Hero Product Photos (apex_cobot, vector_amr, delta_d12, scara_s8)
│   │   ├── server\
│   │   │   └── index.js                <-- Express.js backend & API routing
│   │   ├── package.json
│   │   └── railway.json
│   ├── _railway_deploy\                <-- Railway production deploy mirror
│   ├── _clean_deploy\                  <-- Clean standalone build mirror
│   └── RESTORE_POINT_GUIDE.md          <-- This guide
```

---

## 3. The 4 Featured Industrial Robot Products

| Product Name | Category | Model ID | Assets & Features |
|---|---|---|---|
| **Apex Cobot X16** | Collaborative Robotics | `APX-CB-16` | • 6-axis precision robotic arm, 16.0kg payload<br>• Studio photo: `products/apex_cobot_x16.jpg`<br>• Procedural 3D model with 2-finger servo gripper |
| **Vector AMR 600** | Autonomous Intralogistics | `VCT-AMR-600` | • 600kg deck load, 3D LiDAR SLAM, auto docking<br>• Studio photo: `products/vector_amr_600.jpg`<br>• Procedural 3D model with top roller conveyor deck |
| **Titan Delta D12** | High-Speed Packaging | `TTN-DL-12` | • 240 picks/min, carbon fiber parallel struts<br>• Studio photo: `products/delta_d12.jpg`<br>• Procedural 3D model with vacuum suction end-effector |
| **Hyperion SCARA S8** | Precision Assembly | `HYP-SC-08` | • Sub-micron 4-axis SCARA, 0.32s cycle time<br>• Studio photo: `products/scara_s8.jpg`<br>• Procedural 3D model with vertical ball-screw Z-axis |

---

## 4. How Any Future Agent Can Resume & Modify

### Step 1: Run Local Dev Server
```powershell
cd E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1\app_build
npm start
# Server listens on http://localhost:3000
```

### Step 2: Modifying `demo-matterport.html`
Always edit `generate_clean_matterport.js` and execute it to keep code clean and synced:
```powershell
cd E:\vivpr\ai\v-show\virtual-tradeshow-commercial-v1
node generate_clean_matterport.js
```

### Step 3: Automated Verification (Puppeteer)
```powershell
node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/demo-matterport.html', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: 'test_verify.png' });
  await browser.close();
  console.log('Verification screenshot captured!');
})();
"
```

### Step 4: One-Command Live Deployment to Railway
```powershell
# Sync to deployment mirrors
Copy-Item "app_build\client\demo-matterport.html" "_railway_deploy\client\demo-matterport.html" -Force
Copy-Item "app_build\client\demo-matterport.html" "_clean_deploy\client\demo-matterport.html" -Force

# Git Commit & Push
git add -A
git commit -m "feat: your new feature description"
git push origin master

# Trigger Railway Deployment
railway service source connect --repo goodkie/v-show --branch master --service v-show-commercial-v1
```

---

## 5. Live Production URLs & Endpoints

- **64K Studio Digital Twin (Latest v8.0)**:  
  `https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html`
- **3D WebGL Showroom**:  
  `https://v-show-commercial-v1-production.up.railway.app/demo.html`
- **3DGS Radiance Field Viewer**:  
  `https://v-show-commercial-v1-production.up.railway.app/demo-splat.html`
- **Lead / RFQ Contact API**:  
  `mailto:sales@dna-robotic.com`
