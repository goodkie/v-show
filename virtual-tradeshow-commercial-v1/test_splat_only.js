// test_splat_only.js
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
  page.on('console', msg => console.log(`  [3DGS CONSOLE] ${msg.text()}`));
  page.on('pageerror', err => console.log(`  [3DGS ERROR] ${err.toString()}`));

  console.log('Navigating to demo-splat.html...');
  await page.goto(`${BASE}/demo-splat.html`, { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting 6s...');
  await new Promise(r => setTimeout(r, 6000));
  
  const outPath = path.join(outDir, '34_LIVE_3DGS_VERIFIED.png');
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Saved: ${outPath}`);

  await browser.close();
})();
