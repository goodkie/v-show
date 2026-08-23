// capture_v3_quality.js — v3.0 Full DPR + Anti-Fisheye + Accurate Pins
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
      '--window-size=1600,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });

  console.log('Loading Matterport 3D v3.0...');
  await page.goto(`${BASE}/demo-matterport.html?v=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 5000));

  // 1. Front View — Initial panorama, check sharpness
  await page.screenshot({ path: path.join(outDir, '43_V3_FRONT_SHARP.png'), fullPage: false });
  console.log('Shot 1: Front view saved');

  // 2. Drag right (look left toward cobot wall)
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(1200, 440, { steps: 30 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, '44_V3_LOOK_LEFT_COBOTS.png'), fullPage: false });
  console.log('Shot 2: Look left (cobots) saved');

  // 3. Drag left (look right toward right cobot station)
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(350, 440, { steps: 30 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, '45_V3_LOOK_RIGHT_STATION.png'), fullPage: false });
  console.log('Shot 3: Look right (right station) saved');

  // 4. Reset center + tilt up slightly
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(640, 450, { steps: 20 });
  await page.mouse.up();
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(800, 300, { steps: 20 }); // slight up-tilt
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, '46_V3_TILT_UP_CANOPY.png'), fullPage: false });
  console.log('Shot 4: Tilt up (canopy/signage) saved');

  await browser.close();
  console.log('\n🎉 ALL V3.0 QUALITY SCREENSHOTS CAPTURED!');
})();
