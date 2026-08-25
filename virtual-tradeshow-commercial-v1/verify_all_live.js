const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. Live Cosmetic Demo (Lumière)
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-cosmetic.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_LUMIERE_COSMETIC_DEMO.png' });

    // 2. Live Fashion Demo with White Titles (Vantelle)
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-fashion.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_VANTELLE_WHITE_TITLES.png' });

    // 3. Live Landing Page with 3 Showroom Cards
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      document.getElementById('examples').scrollIntoView();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/LIVE_LANDING_3_CARDS.png' });

    console.log('Saved all 3 live production screenshots!');
  } finally {
    await browser.close();
  }
})();
