// capture_final_live.js
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

  // 1. Landing Page Real 3D Booth
  console.log('1. Capturing Landing 3D Booth...');
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 1400, height: 900 });
  await page1.goto(`${BASE}/?nocache=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));
  const out1 = path.join(outDir, '35_FINAL_LANDING_3D_BOOTH.png');
  await page1.screenshot({ path: out1, fullPage: false });
  console.log(`Saved: ${out1}`);
  await page1.close();

  // 2. Full 3D Showroom (/demo.html)
  console.log('2. Capturing 3D Showroom...');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1400, height: 900 });
  await page2.goto(`${BASE}/demo.html?nocache=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4500));
  const out2 = path.join(outDir, '36_FINAL_DEMO_SHOWROOM_3D.png');
  await page2.screenshot({ path: out2, fullPage: false });
  console.log(`Saved: ${out2}`);
  await page2.close();

  await browser.close();
  console.log('\n🎉 ALL DONE!');
})();
