const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== VERIFYING LIVE RAILWAY PRICING & BUILDER UPDATE ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Live Pricing Page
  console.log('1. Loading Live Pricing Page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/pricing.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/212_LIVE_RAILWAY_PRICING_PRO_BIZ_CUSTOM.png' });
  console.log('Saved 212_LIVE_RAILWAY_PRICING_PRO_BIZ_CUSTOM.png');

  // 2. Live Builder Managed Step 2
  console.log('2. Loading Live Builder Managed Plan Selector...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/builder.html', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.evaluate(() => selectPath('managed'));
  await sleep(500);
  await page.evaluate(() => {
    document.getElementById('m-company').value = 'Live Exhibitor Corp.';
    document.getElementById('m-email').value = 'sales@liveexhibitor.com';
    document.getElementById('m-tradeshow').value = 'Hannover Messe 2026';
    document.getElementById('m-showdate').value = '2026-10-15';
    const form = document.getElementById('form-managed-step1');
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await sleep(1000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/213_LIVE_RAILWAY_BUILDER_PLAN_SELECTOR.png' });
  console.log('Saved 213_LIVE_RAILWAY_BUILDER_PLAN_SELECTOR.png');

  await browser.close();
  console.log('=== LIVE PRICING & BUILDER VERIFICATION COMPLETE! ===');
})();
