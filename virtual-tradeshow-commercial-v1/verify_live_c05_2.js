const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== VERIFYING LIVE RAILWAY dn’a-C05.2 MULTI-EXPERIENCE BOOTHS ===');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-gpu-blocklist', '--enable-webgl']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Live Smart Source Selection in Builder
  console.log('1. Loading Live Builder Source Selection...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/builder.html', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.evaluate(() => selectPath('diy'));
  await sleep(500);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/222_LIVE_RAILWAY_C05_2_SOURCE_GATE.png' });
  console.log('Saved 222_LIVE_RAILWAY_C05_2_SOURCE_GATE.png');

  // 2. Live Single Photo Showroom with Product Drawer
  console.log('2. Loading Live Single Photo Showroom...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/photo-viewer.html?project=proj-single-photo-003', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.evaluate(() => {
    const pin = document.querySelector('.dn-pinpoint-marker');
    if (pin) pin.click();
  });
  await sleep(600);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/223_LIVE_RAILWAY_C05_2_SINGLE_PHOTO_SHOWROOM.png' });
  console.log('Saved 223_LIVE_RAILWAY_C05_2_SINGLE_PHOTO_SHOWROOM.png');

  // 3. Live Multi-View Photo Showroom
  console.log('3. Loading Live Multi-View Photo Showroom...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/photo-viewer.html?project=proj-multiview-004', { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/224_LIVE_RAILWAY_C05_2_MULTIVIEW_SHOWROOM.png' });
  console.log('Saved 224_LIVE_RAILWAY_C05_2_MULTIVIEW_SHOWROOM.png');

  // 4. Live Mobile Viewport Test (iPhone 14 Pro: 393 x 852)
  console.log('4. Testing Mobile Viewport Stability...');
  await page.setViewport({ width: 393, height: 852, isMobile: true, hasTouch: true });
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/photo-viewer.html?project=proj-single-photo-003', { waitUntil: 'networkidle2' });
  await sleep(2000);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/225_LIVE_RAILWAY_C05_2_MOBILE_SINGLE_SHOWROOM.png' });
  console.log('Saved 225_LIVE_RAILWAY_C05_2_MOBILE_SINGLE_SHOWROOM.png');

  await browser.close();
  console.log('=== LIVE C05.2 MULTI-EXPERIENCE VERIFICATION COMPLETE! ===');
})();
