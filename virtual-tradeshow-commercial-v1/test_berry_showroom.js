const path = require('path');
const puppeteer = require('puppeteer');
const express = require(path.join(__dirname, 'app_build', 'node_modules', 'express'));

(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, 'app_build', 'client')));
  const server = app.listen(4326);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    console.log('Navigating to demo-berry.html...');
    await page.goto('http://localhost:4326/demo-berry.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const p1 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/BERRY_SHOWROOM_MAIN.png';
    await page.screenshot({ path: p1 });
    console.log('Saved main berry showroom screenshot to:', p1);

    // Click Product Card 0 to focus and open drawer
    await page.evaluate(() => {
      openProductDrawer(0);
    });
    await new Promise(r => setTimeout(r, 1000));

    const p2 = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/BERRY_SHOWROOM_DRAWER.png';
    await page.screenshot({ path: p2 });
    console.log('Saved berry showroom drawer screenshot to:', p2);

  } finally {
    await browser.close();
    server.close();
  }
})();
