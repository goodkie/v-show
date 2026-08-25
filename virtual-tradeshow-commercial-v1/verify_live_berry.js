const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 1. Check live demo-berry.html
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/demo-berry.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_LIVE_BERRY_DEMO.png' });

    // 2. Check live landing page below the fold (showroom section)
    await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      document.getElementById('examples').scrollIntoView();
    });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_LIVE_LANDING_SHOWROOM_CARDS.png' });

    console.log('Saved live verification screenshots!');
  } finally {
    await browser.close();
  }
})();
