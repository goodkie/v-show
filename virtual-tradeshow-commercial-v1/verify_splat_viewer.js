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

  console.log('Navigating to live 3DGS demo-splat.html...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  page.on('console', msg => console.log(`  BROWSER CONSOLE: ${msg.text()}`));

  await page.goto(`${BASE}/demo-splat.html`, { waitUntil: 'networkidle2', timeout: 90000 });
  console.log('  Page loaded, waiting 8 seconds for Gaussian Splats streaming...');
  await new Promise(r => setTimeout(r, 8000));

  const outPath1 = path.join(outDir, '28_FINAL_3DGS_LIVE_SPLATS.png');
  await page.screenshot({ path: outPath1, fullPage: false });
  console.log(`  Saved: ${outPath1}`);

  // Test clicking Waypoint 1 (Cobot)
  console.log('Clicking Waypoint 1 (Cobot)...');
  await page.evaluate(() => {
    if (window.gotoWP) window.gotoWP(1);
  });
  await new Promise(r => setTimeout(r, 3000));
  const outPath2 = path.join(outDir, '29_FINAL_3DGS_LIVE_WAYPOINT_1.png');
  await page.screenshot({ path: outPath2, fullPage: false });
  console.log(`  Saved: ${outPath2}`);

  // Test clicking Waypoint 2 (Center)
  console.log('Clicking Waypoint 2 (Center)...');
  await page.evaluate(() => {
    if (window.gotoWP) window.gotoWP(2);
  });
  await new Promise(r => setTimeout(r, 3000));
  const outPath3 = path.join(outDir, '30_FINAL_3DGS_LIVE_WAYPOINT_2.png');
  await page.screenshot({ path: outPath3, fullPage: false });
  console.log(`  Saved: ${outPath3}`);

  await browser.close();
  console.log('\n✅ 3DGS ALL SCREENSHOTS COMPLETED SUCCESSFULLY!');
})();
