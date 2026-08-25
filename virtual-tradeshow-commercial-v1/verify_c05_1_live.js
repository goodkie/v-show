const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== VERIFYING LIVE RAILWAY C05.1 PRODUCTION DEPLOYMENT ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Live Second Customer Project
  console.log('1. Loading Live Second Customer (BioProcess Automation Corp.)...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/photo-viewer.html?project=proj-bioprocess-002', { waitUntil: 'networkidle2' });
  await sleep(3500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/206_LIVE_RAILWAY_SECOND_CUSTOMER_C05_1.png' });
  console.log('Saved 206_LIVE_RAILWAY_SECOND_CUSTOMER_C05_1.png');

  // 2. Live Second Customer Pinpoint Drawer
  console.log('2. Opening Second Customer Pinpoint Drawer...');
  await page.evaluate(() => {
    const pinEl = document.querySelector('[data-pin-id="pin-bio-01"]');
    if (pinEl) pinEl.click();
  });
  await sleep(1000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/207_LIVE_RAILWAY_SECOND_CUSTOMER_DRAWER_C05_1.png' });
  console.log('Saved 207_LIVE_RAILWAY_SECOND_CUSTOMER_DRAWER_C05_1.png');

  await browser.close();
  console.log('=== LIVE C05.1 RAILWAY VERIFICATION COMPLETE! ===');
})();
