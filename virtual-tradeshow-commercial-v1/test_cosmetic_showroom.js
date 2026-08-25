const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4334);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('Navigating to demo-cosmetic.html...');
    await page.goto('http://localhost:4334/demo-cosmetic.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const p1 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/COSMETIC_SHOWROOM_MAIN.png';
    await page.screenshot({ path: p1 });
    console.log('Saved Cosmetic showroom main view to:', p1);

    // Open drawer for product 0 (Radiance Bio-Serum)
    await page.evaluate(() => {
      openProductDrawer(0);
    });
    await new Promise(r => setTimeout(r, 1000));

    const p2 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/COSMETIC_SHOWROOM_DRAWER_0.png';
    await page.screenshot({ path: p2 });
    console.log('Saved Cosmetic drawer product 0 view to:', p2);

    // Open drawer for product 2 (Peptide Barrier Cream)
    await page.evaluate(() => {
      openProductDrawer(2);
    });
    await new Promise(r => setTimeout(r, 1000));

    const p3 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/COSMETIC_SHOWROOM_DRAWER_2.png';
    await page.screenshot({ path: p3 });
    console.log('Saved Cosmetic drawer product 2 view to:', p3);

  } finally {
    await browser.close();
    server.close();
  }
})();
