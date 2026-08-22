// verify_splat_viewer.js
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

  // 1. Capture Landing Page 3D Booth
  console.log('1. Capturing Landing Page 3D Booth...');
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 1400, height: 900 });
  await page1.goto(`${BASE}/?ts=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const outPath1 = path.join(outDir, '31_LIVE_LANDING_REAL_3D_BOOTH.png');
  await page1.screenshot({ path: outPath1, fullPage: false });
  console.log(`  Saved: ${outPath1}`);
  await page1.close();

  // 2. Capture Full 3D Showroom (/demo.html)
  console.log('2. Capturing 3D Showroom...');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1400, height: 900 });
  await page2.goto(`${BASE}/demo.html?ts=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  const outPath2 = path.join(outDir, '32_LIVE_DEMO_SHOWROOM_REAL_3D.png');
  await page2.screenshot({ path: outPath2, fullPage: false });
  console.log(`  Saved: ${outPath2}`);
  await page2.close();

  // 3. Capture 3DGS Virtual Tour Page (/demo-splat.html)
  console.log('3. Capturing 3DGS Virtual Tour Page...');
  const page3 = await browser.newPage();
  await page3.setViewport({ width: 1400, height: 900 });
  page3.on('console', msg => console.log(`  [3DGS CONSOLE] ${msg.text()}`));
  await page3.goto(`${BASE}/demo-splat.html?ts=${Date.now()}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  const outPath3 = path.join(outDir, '33_LIVE_3DGS_TOUR_PAGE.png');
  await page3.screenshot({ path: outPath3, fullPage: false });
  console.log(`  Saved: ${outPath3}`);
  await page3.close();

  await browser.close();
  console.log('\n✅ ALL LIVE SCREENSHOTS CAPTURED SUCCESSFULLY!');
})();
