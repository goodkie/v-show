// capture_3d_rotation.js
const puppeteer = require('puppeteer');
const path = require('path');
const outDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
const BASE = 'https://v-show-commercial-v1-production.up.railway.app';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-gpu','--use-gl=angle','--use-angle=swiftshader',
      '--enable-webgl','--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--window-size=1400,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('1. Loading Matterport 3D Digital Twin...');
  await page.goto(`${BASE}/demo-matterport.html?nocache=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));

  // Initial Front View
  const out1 = path.join(outDir, '40_3D_PHOTO_FRONT_VIEW.png');
  await page.screenshot({ path: out1, fullPage: false });
  console.log(`Saved: ${out1}`);

  // Perform 3D Mouse Drag (Pan camera to the right by dragging left)
  console.log('2. Performing 3D Panoramic Drag (Looking Right towards Display Tables)...');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(300, 420, { steps: 20 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1200));

  const out2 = path.join(outDir, '41_3D_PHOTO_ROTATED_RIGHT.png');
  await page.screenshot({ path: out2, fullPage: false });
  console.log(`Saved: ${out2}`);

  // Perform 3D Mouse Drag (Pan camera to the left by dragging right)
  console.log('3. Performing 3D Panoramic Drag (Looking Left towards Cobot Array)...');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(1100, 460, { steps: 25 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1200));

  const out3 = path.join(outDir, '42_3D_PHOTO_ROTATED_LEFT.png');
  await page.screenshot({ path: out3, fullPage: false });
  console.log(`Saved: ${out3}`);

  await browser.close();
  console.log('\n🎉 ALL 3D ROTATION SCREENSHOTS CAPTURED!');
})();
