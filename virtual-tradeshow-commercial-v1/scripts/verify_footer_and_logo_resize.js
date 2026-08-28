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

  // 1. 라이브 랜딩 페이지 헤더 & Hero 캡처
  const landingHtml = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/');
  await page.setContent(landingHtml, { waitUntil: 'load' });
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LANDING_HEADER_25PX.png', fullPage: false });

  // 2. 푸터 사이트맵 캡처
  await page.evaluate(() => {
    document.querySelector('footer.footer').scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_FOOTER_SITEMAP.png', fullPage: false });

  // 3. builder.html 헤더 캡처
  const builderHtml = await fetchUrl('https://v-show-commercial-v1-production.up.railway.app/builder.html');
  await page.setContent(builderHtml, { waitUntil: 'load' });
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_BUILDER_HEADER_25PX.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESS!');
})();
