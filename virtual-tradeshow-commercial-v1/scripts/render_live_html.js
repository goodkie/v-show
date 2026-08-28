const puppeteer = require('puppeteer');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. 라이브 랜딩 페이지 HTML 가져와서 렌더링
  const landingHtml = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/');
  await page.setContent(landingHtml, { waitUntil: 'load' });
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LANDING_BASE64_LOGO.png', fullPage: false });
  console.log('✅ Captured Landing Page with new 3DNA base64 logo');

  // 2. 라이브 builder.html HTML 가져와서 렌더링
  const builderHtml = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/builder.html');
  await page.setContent(builderHtml, { waitUntil: 'load' });
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_BUILDER_BASE64_LOGO.png', fullPage: false });
  console.log('✅ Captured Builder Page with matching header logo & title');

  await browser.close();
})();
