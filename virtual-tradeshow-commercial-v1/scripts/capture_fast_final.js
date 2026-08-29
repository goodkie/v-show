const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });

  console.log('Navigating to landing page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 6000));

  const artifactDir = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8';

  // 1. Vantelle
  await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    if (iframes[1]) iframes[1].scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_VANTELLE_FINAL.png'), fullPage: false });

  // 2. Lumiere
  await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    if (iframes[2]) iframes[2].scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_LUMIERE_FINAL.png'), fullPage: false });

  // 3. Nova Living
  await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    if (iframes[3]) iframes[3].scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(artifactDir, 'PROD_LIVE_NOVA_FINAL.png'), fullPage: false });

  console.log('✅ Captured all final screenshots!');
  await browser.close();
})();
