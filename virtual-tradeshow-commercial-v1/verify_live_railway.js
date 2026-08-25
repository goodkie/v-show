const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== VERIFYING LIVE RAILWAY PRODUCTION DEPLOYMENT ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Live Landing Page
  console.log('1. Loading Live Production Landing Page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });
  await sleep(3500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/192_LIVE_RAILWAY_LANDING_C04.png' });
  console.log('Saved 192_LIVE_RAILWAY_LANDING_C04.png');

  // 2. Live Smart Booth Wizard
  console.log('2. Loading Live Smart Booth Wizard...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/builder.html', { waitUntil: 'networkidle2' });
  await sleep(2500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/193_LIVE_RAILWAY_BUILDER_WIZARD_C04.png' });
  console.log('Saved 193_LIVE_RAILWAY_BUILDER_WIZARD_C04.png');

  // 3. Live Immersive Studio with BUILD A BOOTH LIKE THIS CTA
  console.log('3. Loading Live 64K Immersive Studio...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-matterport.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/194_LIVE_RAILWAY_IMMERSIVE_STUDIO_C04.png' });
  console.log('Saved 194_LIVE_RAILWAY_IMMERSIVE_STUDIO_C04.png');

  await browser.close();
  console.log('=== LIVE PRODUCTION VERIFICATION COMPLETE! ===');
})();
