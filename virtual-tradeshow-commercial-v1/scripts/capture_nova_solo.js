const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2', timeout: 60000 });

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

  // Nova Living Furniture Focus & Wait for Texture
  await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    if (iframes[3]) iframes[3].scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_NOVA_SOLO_128K.png'), fullPage: false });

  console.log('✅ Captured PROD_LIVE_NOVA_SOLO_128K.png');
  await browser.close();
})();
