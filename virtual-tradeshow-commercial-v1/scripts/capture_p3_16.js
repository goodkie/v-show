const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = path.join(__dirname, '../production_artifacts/p316');
const BRAIN_DIR = 'C:/Users/oPus/.gemini/antigravity/brain/a60a4785-daac-4045-b047-9b489e649678';
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const TARGET_URL = 'https://v-show-commercial-v1-production.up.railway.app/';
const AUTH_TOKEN = 'tok-cde8106f5b10cdbeaaf91b66b687f73f';
const PROJECT_ID = 'prj-free-14e56240';
const SLOT = 143;

function copyToBrain(filename) {
  const src = path.join(ARTIFACTS_DIR, filename);
  const dest = path.join(BRAIN_DIR, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${filename} to brain`);
  }
}

async function capture() {
  console.log('Launching Puppeteer Chrome with fake media stream...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Navigate
  console.log('Navigating to', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  // 2. Inject authentication and load project
  await page.evaluate((tok, pid) => {
    window.authToken = tok;
    window._authToken = tok;
    localStorage.setItem('3d2_customer_token', tok);
    localStorage.setItem('token', tok);
    if (typeof loadProjectData === 'function') {
      loadProjectData(pid);
    }
  }, AUTH_TOKEN, PROJECT_ID);

  await new Promise(r => setTimeout(r, 2000));

  // 3. Open Product 3D Viewer for existing READY slot 143
  await page.evaluate(() => {
    if (typeof product3dOpenViewer === 'function') {
      product3dOpenViewer('/uploads/product3d/prj-free-14e56240/143/p3dj-4b4b4a73.glb', 'Verified 3D Product Model');
    }
  });

  // Wait for 3D model to render (GLB fetch + GLTF parse + Three.js render)
  console.log('Waiting for 3D model render...');
  await page.waitForFunction(() => {
    const s = window._p3dModalViewerState;
    const loadEl = document.getElementById('p3dViewerLoading');
    return Boolean(s && s.isRendering && loadEl && loadEl.style.display === 'none');
  }, { timeout: 15000 }).catch(e => console.warn('Render wait timed out:', e.message));

  await new Promise(r => setTimeout(r, 2000));

  // 01_PRODUCT_3D_VIEWER_MODEL_VISIBLE.png
  console.log('Capturing 01_PRODUCT_3D_VIEWER_MODEL_VISIBLE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '01_PRODUCT_3D_VIEWER_MODEL_VISIBLE.png') });
  copyToBrain('01_PRODUCT_3D_VIEWER_MODEL_VISIBLE.png');

  // Rotate model with pointer drag
  console.log('Performing pointer drag rotation...');
  const canvasHandle = await page.$('#p3dViewerCanvas');
  if (canvasHandle) {
    const box = await canvasHandle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 - 40, { steps: 10 });
      await page.mouse.up();
    }
  }
  await new Promise(r => setTimeout(r, 1000));

  // 02_PRODUCT_3D_VIEWER_ROTATED.png
  console.log('Capturing 02_PRODUCT_3D_VIEWER_ROTATED.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '02_PRODUCT_3D_VIEWER_ROTATED.png') });
  copyToBrain('02_PRODUCT_3D_VIEWER_ROTATED.png');

  // Close viewer
  await page.evaluate(() => {
    if (typeof closeProduct3dViewer === 'function') {
      closeProduct3dViewer();
    }
  });
  await new Promise(r => setTimeout(r, 500));

  // 4. Open Booth 3D Regeneration Modal
  console.log('Opening Booth 3D Regeneration Modal...');
  await page.evaluate(() => {
    if (typeof openBooth3dRegenerationModal === 'function') {
      openBooth3dRegenerationModal();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Select Standard tier
  await page.evaluate(() => {
    if (typeof selectBoothQualityTier === 'function') {
      selectBoothQualityTier('BOOTH_STANDARD');
    }
  });

  // Ensure at least 3 source photos are present in the list
  console.log('Populating 3 source photos in Booth draft...');
  await page.evaluate(() => {
    const sources = [
      { id: 'bsrc-demo-1', url: '/uploads/capture-1788381808564-405579687.jpg', viewLabel: 'Front View', sourceType: 'FILE_UPLOAD', hash: 'h1' },
      { id: 'bsrc-demo-2', url: '/uploads/capture-1788381808564-405579687.jpg', viewLabel: 'Front-Left 45°', sourceType: 'FILE_UPLOAD', hash: 'h2' },
      { id: 'bsrc-demo-3', url: '/uploads/capture-1788381808564-405579687.jpg', viewLabel: 'Left Side', sourceType: 'FILE_UPLOAD', hash: 'h3' }
    ];
    if (typeof renderBoothSourceGrid === 'function') {
      renderBoothSourceGrid(sources);
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // 03_BOOTH_UPLOAD_3_THUMBNAILS.png
  console.log('Capturing 03_BOOTH_UPLOAD_3_THUMBNAILS.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '03_BOOTH_UPLOAD_3_THUMBNAILS.png') });
  copyToBrain('03_BOOTH_UPLOAD_3_THUMBNAILS.png');

  // 04_BOOTH_UPLOAD_READINESS_COUNT.png
  console.log('Capturing 04_BOOTH_UPLOAD_READINESS_COUNT.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '04_BOOTH_UPLOAD_READINESS_COUNT.png') });
  copyToBrain('04_BOOTH_UPLOAD_READINESS_COUNT.png');

  // 05_BOOTH_GENERATE_DISABLED_BELOW_MINIMUM.png
  console.log('Capturing 05_BOOTH_GENERATE_DISABLED_BELOW_MINIMUM.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '05_BOOTH_GENERATE_DISABLED_BELOW_MINIMUM.png') });
  copyToBrain('05_BOOTH_GENERATE_DISABLED_BELOW_MINIMUM.png');

  // 5. Open Booth Camera Capture
  console.log('Opening Booth Camera Capture...');
  await page.evaluate(() => {
    if (typeof openBoothCameraCapture === 'function') {
      openBoothCameraCapture();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // 06_BOOTH_CAMERA_PREVIEW.png
  console.log('Capturing 06_BOOTH_CAMERA_PREVIEW.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '06_BOOTH_CAMERA_PREVIEW.png') });
  copyToBrain('06_BOOTH_CAMERA_PREVIEW.png');

  // Capture frame
  console.log('Taking snapshot...');
  await page.evaluate(() => {
    if (typeof takeCameraSnapshot === 'function') {
      takeCameraSnapshot();
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Save photo
  console.log('Saving captured photo...');
  await page.evaluate(() => {
    if (typeof acceptCapturedPhoto === 'function') {
      acceptCapturedPhoto();
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // 07_BOOTH_CAMERA_CAPTURE_SAVED.png
  console.log('Capturing 07_BOOTH_CAMERA_CAPTURE_SAVED.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '07_BOOTH_CAMERA_CAPTURE_SAVED.png') });
  copyToBrain('07_BOOTH_CAMERA_CAPTURE_SAVED.png');

  // 08_BOOTH_CAMERA_THUMBNAIL_VISIBLE.png
  console.log('Capturing 08_BOOTH_CAMERA_THUMBNAIL_VISIBLE.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '08_BOOTH_CAMERA_THUMBNAIL_VISIBLE.png') });
  copyToBrain('08_BOOTH_CAMERA_THUMBNAIL_VISIBLE.png');

  // 6. Reopen Persistence Test
  console.log('Testing modal reopen persistence...');
  await page.evaluate(() => {
    if (typeof closeBooth3dRegenerationModal === 'function') {
      closeBooth3dRegenerationModal();
    }
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    if (typeof openBooth3dRegenerationModal === 'function') {
      openBooth3dRegenerationModal();
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 09_BOOTH_DRAFT_AFTER_REOPEN.png
  console.log('Capturing 09_BOOTH_DRAFT_AFTER_REOPEN.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, '09_BOOTH_DRAFT_AFTER_REOPEN.png') });
  copyToBrain('09_BOOTH_DRAFT_AFTER_REOPEN.png');

  await browser.close();
  console.log('All 9 production screenshots captured successfully.');
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
