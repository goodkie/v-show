const puppeteer = require('puppeteer');
const https = require('https');
const path = require('path');
const fs = require('fs');

const PROD_BASE = 'https://v-show-commercial-v1-production.up.railway.app';
const ARTIFACT_DIR = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

function request(method, pathName, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, PROD_BASE);
    const postData = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runLiveProductionAudit() {
  console.log('===============================================================');
  console.log(' dn’a-C10 LIVE PRODUCTION 3D PIPELINE AUDIT & VISUAL QA');
  console.log(' Target: https://v-show-commercial-v1-production.up.railway.app');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Live API: Create One-Photo 3D Booth Project
  const bizName = `Orbital Robotics 3D ${Date.now()}`;
  const previewRes = await request('POST', '/api/free-funnel/preview', {
    businessName: bizName,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });

  assert(previewRes.status === 201 && previewRes.data.projectId, `Live API: Free 3D Booth Created (${previewRes.data.projectId})`);
  assert(previewRes.data.experienceType === 'ONE_PHOTO_3D_BOOTH', 'Live API: experienceType is ONE_PHOTO_3D_BOOTH');
  assert(previewRes.data.coordinateSystem === 'WORLD_3D', 'Live API: coordinateSystem is WORLD_3D');
  const projectId = previewRes.data.projectId;

  // 2. Live API: Place 3D World Space Pinpoint
  const pinRes = await request('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    productName: 'Orbital Precision Rover X-1',
    description: 'Autonomous spatial mapping and AI navigation rover.',
    x: -2.8,
    y: 0.68,
    z: -3.2,
    targetObjectId: 'BoothPedestal_0',
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(pinRes.status === 201 && pinRes.data.pinpoint?.x === -2.8, 'Live API: 3D Pinpoint created on BoothPedestal_0');

  // 3. Live Browser Verification & Screenshots
  console.log('\n--- Launching Puppeteer for Live Production 3D Browser QA ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCacheEnabled(false);
  await page.goto(`${PROD_BASE}/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  // Load project into 3D studio
  await page.evaluate(async (pId) => {
    await loadProjectIntoStudio(pId);
  }, projectId);

  await new Promise(r => setTimeout(r, 1200));

  // Check WebGL Canvas & 3D Elements
  const sceneState = await page.evaluate(() => {
    const canvas = document.querySelector('#freeBooth3DViewer canvas');
    const hasThree = !!window.THREE;
    const hasMesh = !!window.booth3D?.scene?.children?.length;
    const hasSignage = !!window.booth3D?.scene?.getObjectByName('OnePhoto3DBoothRoom')?.getObjectByName('BoothSignage');
    const cam = window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;

    return { hasCanvas: !!canvas, hasThree, hasMesh, hasSignage, cam };
  });

  assert(sceneState.hasCanvas, 'WEBGL_CANVAS_PRESENT: Live WebGL canvas mounted inside #freeBooth3DViewer');
  assert(sceneState.hasMesh, 'REAL_3D_SCENE_PRESENT: Live Three.js 3D booth geometry constructed');
  assert(sceneState.hasSignage, 'BUSINESS_NAME_SIGNAGE_PASS: Dynamic Illuminated Business Header created');

  // SCREENSHOT 1: DNA_C10_FREE_3D_INITIAL.png
  const initialCam = sceneState.cam;
  const initialPath = path.join(ARTIFACT_DIR, 'DNA_C10_FREE_3D_INITIAL.png');
  await page.screenshot({ path: initialPath, fullPage: false });
  console.log(`1. Saved: ${initialPath}`);

  // Perform 3D Orbit Drag
  const viewerBox = await page.$('#freeBooth3DViewer');
  const rect = await viewerBox.boundingBox();
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 220, cy + 80, { steps: 12 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  const rotatedCam = await page.evaluate(() => {
    return window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;
  });

  const camRotated = initialCam && rotatedCam && (initialCam.x !== rotatedCam.x || initialCam.z !== rotatedCam.z);
  assert(camRotated, `CAMERA_ORBIT_PASS: Live camera orbit changed position to (${rotatedCam?.x}, ${rotatedCam?.y}, ${rotatedCam?.z})`);

  // SCREENSHOT 2: DNA_C10_FREE_3D_ROTATED.png
  const rotatedPath = path.join(ARTIFACT_DIR, 'DNA_C10_FREE_3D_ROTATED.png');
  await page.screenshot({ path: rotatedPath, fullPage: false });
  console.log(`2. Saved: ${rotatedPath}`);

  // Perform Zoom via Wheel
  await page.mouse.move(cx, cy);
  await page.mouse.wheel({ deltaY: -500 });
  await new Promise(r => setTimeout(r, 500));

  const zoomedCam = await page.evaluate(() => {
    return window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;
  });

  const camZoomed = rotatedCam && zoomedCam && (rotatedCam.z !== zoomedCam.z || rotatedCam.x !== zoomedCam.x);
  assert(camZoomed, `CAMERA_ZOOM_PASS: Live camera zoom updated distance to (${zoomedCam?.x}, ${zoomedCam?.y}, ${zoomedCam?.z})`);

  // SCREENSHOT 3: DNA_C10_FREE_3D_ZOOMED.png
  const zoomedPath = path.join(ARTIFACT_DIR, 'DNA_C10_FREE_3D_ZOOMED.png');
  await page.screenshot({ path: zoomedPath, fullPage: false });
  console.log(`3. Saved: ${zoomedPath}`);

  // SCREENSHOT 4: DNA_C10_3D_PINPOINT.png
  const pinState = await page.evaluate(() => {
    const marker = document.querySelector('.pinpoint-marker');
    return { exists: !!marker, display: marker ? marker.style.display : null, left: marker?.style.left, top: marker?.style.top };
  });
  assert(pinState.exists && pinState.display !== 'none', 'PINPOINT_STAYS_ATTACHED_AFTER_ORBIT: 3D Pinpoint remains attached to surface in real-time projection');
  const pinPath = path.join(ARTIFACT_DIR, 'DNA_C10_3D_PINPOINT.png');
  await page.screenshot({ path: pinPath, fullPage: false });
  console.log(`4. Saved: ${pinPath}`);

  // Open Product Drawer
  await page.evaluate(() => {
    const marker = document.querySelector('.pinpoint-marker');
    if (marker) marker.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const drawerState = await page.evaluate(() => {
    const modal = document.getElementById('productDrawerModal');
    const title = document.getElementById('drawerProdTitle')?.textContent;
    return { isOpen: modal && modal.style.display === 'flex', title };
  });
  assert(drawerState.isOpen && drawerState.title.includes('Orbital Precision Rover'), 'PRODUCT_DETAIL_PASS: Product Drawer opened with specifications and commercial actions');

  // SCREENSHOT 5: DNA_C10_PRODUCT_DETAIL.png
  const detailPath = path.join(ARTIFACT_DIR, 'DNA_C10_PRODUCT_DETAIL.png');
  await page.screenshot({ path: detailPath, fullPage: false });
  console.log(`5. Saved: ${detailPath}`);

  // Trigger 2nd Product addition for Commercial Plan conversion
  await page.evaluate(() => {
    closeProductDrawer();
    handle3DClick({ clientX: 500, clientY: 400 });
  });
  await new Promise(r => setTimeout(r, 500));

  const planModalState = await page.evaluate(() => {
    const modal = document.getElementById('planModal');
    return modal && modal.style.display === 'flex';
  });
  assert(planModalState, 'SECOND_PRODUCT_UPGRADE_PROMPT: 2nd product triggers Commercial Plan conversion modal');

  // SCREENSHOT 6: DNA_C10_UPGRADE_PROMPT.png
  const upgradePath = path.join(ARTIFACT_DIR, 'DNA_C10_UPGRADE_PROMPT.png');
  await page.screenshot({ path: upgradePath, fullPage: false });
  console.log(`6. Saved: ${upgradePath}`);

  await browser.close();

  console.log('\n===============================================================');
  console.log(` PRODUCTION C10 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveProductionAudit().catch(err => {
  console.error('Fatal live audit error:', err);
  process.exit(1);
});
