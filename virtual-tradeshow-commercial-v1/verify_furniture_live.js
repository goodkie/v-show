const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. Live Landing Page (2 columns, 4 demo cards, no fullscreen links)
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));
    await page.evaluate(() => {
      document.getElementById('examples').scrollIntoView();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_LANDING_2X2_CARDS.png' });

    // 2. Live Furniture Demo (Nova Living)
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-furniture.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_FURNITURE_DEMO.png' });

    console.log('Successfully captured final live screenshots!');
  } finally {
    await browser.close();
  }
})();
