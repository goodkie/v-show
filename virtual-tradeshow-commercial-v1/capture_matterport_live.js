// capture_matterport_live.js
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

  // 1. Matterport 3D Tour Mode (Photo Backdrop + 3D Mattertags)
  console.log('1. Capturing Matterport Tour Mode...');
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(`${BASE}/demo-matterport.html?nocache=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 4000));
  
  const out1 = path.join(outDir, '37_LIVE_MATTERPORT_DIGITAL_TWIN.png');
  await page.screenshot({ path: out1, fullPage: false });
  console.log(`Saved: ${out1}`);

  // 2. Switch to 3D Dollhouse Mode
  console.log('2. Switching to 3D Dollhouse Mode...');
  await page.click('#btn-mode-dollhouse');
  await new Promise(r => setTimeout(r, 2000));
  
  const out2 = path.join(outDir, '38_LIVE_MATTERPORT_DOLLHOUSE.png');
  await page.screenshot({ path: out2, fullPage: false });
  console.log(`Saved: ${out2}`);

  // 3. Switch to Node 02 (Robots line)
  console.log('3. Switching to Node 02 (Robots)...');
  await page.click('#btn-mode-tour');
  await page.click('#nbtn-1');
  await new Promise(r => setTimeout(r, 2500));
  
  const out3 = path.join(outDir, '39_LIVE_MATTERPORT_NODE2_ROBOTS.png');
  await page.screenshot({ path: out3, fullPage: false });
  console.log(`Saved: ${out3}`);

  await browser.close();
  console.log('\n🎉 ALL MATTERPORT SCREENSHOTS CAPTURED!');
})();
