const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });

  // 1. 랜딩 페이지 검증
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 });
  const landingBrandTitle = await page.$eval('.brand-logo', el => el.innerText.trim());
  const landingFontSize = await page.$eval('.brand-logo span', el => window.getComputedStyle(el).fontSize);
  console.log('Landing Header Brand Title:', landingBrandTitle, '| Font Size:', landingFontSize);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LANDING_NEW_LOGO.png', fullPage: false });

  // 2. builder.html 검증
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/builder.html?_t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 });
  const builderBrandTitle = await page.$eval('.brand-logo-wrap', el => el.innerText.trim());
  const builderFontSize = await page.$eval('.brand-logo-wrap span', el => window.getComputedStyle(el).fontSize);
  console.log('Builder Header Brand Title:', builderBrandTitle, '| Font Size:', builderFontSize);
  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_BUILDER_NEW_LOGO.png', fullPage: false });

  await browser.close();
  console.log('✅ ALL SCREENSHOTS CAPTURED SUCCESS!');
})();
