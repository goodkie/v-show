const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== VERIFYING LIVE RAILWAY PRODUCTION DEPLOYMENT (C05) ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Live Landing Page
  console.log('1. Loading Live Landing Page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });
  await sleep(3500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/200_LIVE_RAILWAY_LANDING_C05.png' });
  console.log('Saved 200_LIVE_RAILWAY_LANDING_C05.png');

  // 2. Live Dynamic Photo Viewer
  console.log('2. Loading Live Photo Immersive Master Viewer...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/photo-viewer.html?project=demo-apex', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/201_LIVE_RAILWAY_PHOTO_VIEWER_C05.png' });
  console.log('Saved 201_LIVE_RAILWAY_PHOTO_VIEWER_C05.png');

  // 3. Live Reference Master
  console.log('3. Loading Live Photo Immersive Reference Master...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/202_LIVE_RAILWAY_REFERENCE_C05.png' });
  console.log('Saved 202_LIVE_RAILWAY_REFERENCE_C05.png');

  await browser.close();
  console.log('=== LIVE C05 RAILWAY VERIFICATION COMPLETE! ===');
})();
