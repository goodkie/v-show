const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });

  // 1. 랜딩 페이지 검증
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LANDING_BASE64_LOGO.png', fullPage: false });

  // 2. builder.html 검증
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/builder.html?_t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_BUILDER_BASE64_LOGO.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESS!');
})();
