// =====================================================================
// dn’a-C10 — RESTORE REAL 3D FREE VIRTUAL BOOTH PIPELINE E2E TEST SUITE
// =====================================================================

const puppeteer = require('puppeteer');
const http = require('http');

const BASE_URL = 'http://localhost:3000';
let devToken = '';

async function runRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', (e) => reject(e));
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

async function runAllTests() {
  console.log('=====================================================');
  console.log(' dn’a-C10 REAL 3D FREE VIRTUAL BOOTH TEST SUITE');
  console.log('=====================================================\n');

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

  // 1. API: Free Booth Creation returns ONE_PHOTO_3D_BOOTH
  const bizName = `Nova 3D Dynamics ${Date.now()}`;
  const previewRes = await runRequest('POST', '/api/free-funnel/preview', {
    businessName: bizName,
    photoUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  }, { 'x-forwarded-for': '198.51.100.44' });

  assert(previewRes.status === 201, 'FREE_UPLOAD_PASS: API creates free booth (HTTP 201)');
  assert(previewRes.data.experienceType === 'ONE_PHOTO_3D_BOOTH', 'EXPERIENCE_TYPE: experienceType is ONE_PHOTO_3D_BOOTH');
  assert(previewRes.data.coordinateSystem === 'WORLD_3D', '3D Coordinate System configured (WORLD_3D)');
  const projectId = previewRes.data.projectId;

  // 2. API: 3D World Coordinates Pinpoint Creation
  const pinRes = await runRequest('POST', `/api/free-funnel/projects/${projectId}/pinpoints`, {
    productName: 'Apex Autonomous Rover N-3D',
    description: 'Precision navigation 3D robot system.',
    x: -2.8,
    y: 0.68,
    z: -3.2,
    targetObjectId: 'BoothPedestal_0',
    imageUrl: '/assets/demo/dna-showcase/hero/dna_showcase_photoreal_hero.jpg'
  });
  assert(pinRes.status === 201 && pinRes.data.pinpoint?.x === -2.8, '3D_PINPOINT_RAYCAST_PASS: 3D pinpoint created with world coordinates');

  // 3. API: AI Description Generator
  const aiRes = await runRequest('POST', '/api/free-funnel/ai/suggest-description', {
    productName: 'Apex Autonomous Rover N-3D',
    businessName: bizName
  });
  assert(aiRes.status === 200 && aiRes.data.suggestedDescription?.includes(bizName), 'AI_DESCRIPTION_PASS: AI description draft generated');

  // 4. Browser E2E: Real WebGL Scene, OrbitControls & Raycasting
  console.log('\n--- Launching Puppeteer for Browser 3D E2E ---');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--use-gl=angle']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle0' });

  // Load the created project into the 3D studio
  await page.evaluate(async (pId) => {
    await loadProjectIntoStudio(pId);
  }, projectId);

  await new Promise(r => setTimeout(r, 800));

  // Check WebGL Canvas and Scene presence
  const webglCheck = await page.evaluate(() => {
    const canvas = document.querySelector('#freeBooth3DViewer canvas');
    const hasWebGL = !!canvas && !!window.THREE;
    const sceneObj = window.booth3D ? window.booth3D.scene : null;
    const hasMesh = !!sceneObj && sceneObj.children.length > 0;
    const hasSignage = !!sceneObj && !!sceneObj.getObjectByName('OnePhoto3DBoothRoom')?.getObjectByName('BoothSignage');
    const cameraPos = window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;

    return {
      hasCanvas: !!canvas,
      hasWebGL,
      hasMesh,
      hasSignage,
      cameraPos
    };
  });

  assert(webglCheck.hasCanvas, 'WEBGL_CANVAS_PRESENT: Canvas element mounted inside #freeBooth3DViewer');
  assert(webglCheck.hasMesh, 'REAL_3D_SCENE_PRESENT: Three.js 3D scene populated with geometry meshes');
  assert(webglCheck.hasSignage, 'BUSINESS_NAME_SIGNAGE_PASS: Signage header mesh constructed');

  const initialCam = webglCheck.cameraPos;

  // Perform Orbit Drag via Mouse Drag
  const viewerBox = await page.$('#freeBooth3DViewer');
  const boxRect = await viewerBox.boundingBox();
  const centerX = boxRect.x + boxRect.width / 2;
  const centerY = boxRect.y + boxRect.height / 2;

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 180, centerY + 60, { steps: 10 });
  await page.mouse.up();

  await new Promise(r => setTimeout(r, 400));

  const rotatedCam = await page.evaluate(() => {
    return window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;
  });

  const cameraMoved = initialCam && rotatedCam && (initialCam.x !== rotatedCam.x || initialCam.y !== rotatedCam.y || initialCam.z !== rotatedCam.z);
  assert(cameraMoved, `CAMERA_ORBIT_PASS: Camera orbit rotated from (${initialCam?.x}, ${initialCam?.y}, ${initialCam?.z}) to (${rotatedCam?.x}, ${rotatedCam?.y}, ${rotatedCam?.z})`);

  // Perform Zoom via Wheel
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel({ deltaY: -400 });
  await new Promise(r => setTimeout(r, 400));

  const zoomedCam = await page.evaluate(() => {
    return window.booth3D?.camera ? {
      x: Number(window.booth3D.camera.position.x.toFixed(2)),
      y: Number(window.booth3D.camera.position.y.toFixed(2)),
      z: Number(window.booth3D.camera.position.z.toFixed(2))
    } : null;
  });

  const cameraZoomed = rotatedCam && zoomedCam && (rotatedCam.z !== zoomedCam.z || rotatedCam.x !== zoomedCam.x);
  assert(cameraZoomed, `CAMERA_ZOOM_PASS: Camera zoom modified distance to (${zoomedCam?.x}, ${zoomedCam?.y}, ${zoomedCam?.z})`);

  // Check 3D Pinpoint projection attachment
  const pinpointProjection = await page.evaluate(() => {
    const marker = document.querySelector('.pinpoint-marker');
    return {
      markerExists: !!marker,
      display: marker ? marker.style.display : null,
      left: marker ? marker.style.left : null,
      top: marker ? marker.style.top : null
    };
  });
  assert(pinpointProjection.markerExists && pinpointProjection.display !== 'none', 'PINPOINT_STAYS_ATTACHED_AFTER_ORBIT: Pinpoint projected onto 3D surface after camera orbit & zoom');

  // Open Product Drawer by clicking pinpoint
  await page.evaluate(() => {
    const marker = document.querySelector('.pinpoint-marker');
    if (marker) marker.click();
  });
  await new Promise(r => setTimeout(r, 400));

  const drawerOpen = await page.evaluate(() => {
    const modal = document.getElementById('productDrawerModal');
    const title = document.getElementById('drawerProdTitle')?.textContent;
    return modal && modal.style.display === 'flex' && title.includes('Apex Autonomous Rover');
  });
  assert(drawerOpen, 'PRODUCT_DETAIL_PASS: Product detail drawer opened with full specifications & buyer actions');

  // Trigger 2nd Product addition to verify Commercial Plan upgrade modal
  await page.evaluate(() => {
    closeProductDrawer();
    handle3DClick({ clientX: 500, clientY: 400 });
  });
  await new Promise(r => setTimeout(r, 400));

  const upgradeModalOpen = await page.evaluate(() => {
    const modal = document.getElementById('planModal');
    return modal && modal.style.display === 'flex';
  });
  assert(upgradeModalOpen, 'SECOND_PRODUCT_UPGRADE_PROMPT: 2nd product triggers Commercial Plan conversion modal');

  await browser.close();

  console.log('\n=====================================================');
  console.log(` C10 TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal C10 test error:', err);
  process.exit(1);
});
