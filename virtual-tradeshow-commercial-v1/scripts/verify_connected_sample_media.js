const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  console.log('Navigating to live production landing page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });

  // 1. Scroll to Examples / Showcases section
  await page.evaluate(() => {
    const el = document.querySelector('#examples') || document.querySelector('.showcase-container');
    if (el) el.scrollIntoView();
  });

  await new Promise(r => setTimeout(r, 4000));

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_ALL_SAMPLE_MEDIA_CONNECTED.png'), fullPage: false });

  console.log('✅ Captured PROD_LIVE_ALL_SAMPLE_MEDIA_CONNECTED.png');
  await browser.close();
})();
