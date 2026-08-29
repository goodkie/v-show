const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const failedRequests = [];
  const consoleErrors = [];

  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), failure: req.failure() ? req.failure().errorText : 'unknown' });
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  console.log('Navigating to landing page...');
  await page.goto('https://v-show-commercial-v1-production.up.railway.app/?_t=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 });

  // 스크롤하여 examples 섹션으로 이동
  await page.evaluate(() => {
    const el = document.getElementById('examples');
    if (el) el.scrollIntoView();
  });
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n--- FAILED REQUESTS ON LANDING PAGE ---');
  failedRequests.forEach(r => console.log(`  ❌ ${r.url} (${r.failure})`));

  console.log('\n--- CONSOLE ERRORS ON LANDING PAGE ---');
  consoleErrors.forEach(err => console.log(`  ⚠️ ${err}`));

  // 각 iframe 내부의 상태 점검
  const iframes = await page.$$('.demo-card iframe');
  console.log(`\nFound ${iframes.length} demo iframes.`);

  for (let i = 0; i < iframes.length; i++) {
    const frame = await iframes[i].contentFrame();
    if (frame) {
      const title = await frame.title();
      const hasCanvas = await frame.$('canvas');
      console.log(`  Iframe ${i}: Title="${title}", CanvasPresent=${!!hasCanvas}`);
    } else {
      console.log(`  Iframe ${i}: Failed to get contentFrame`);
    }
  }

  await page.screenshot({ path: 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/PROD_LIVE_EXAMPLES_SECTION_CHECK.png', fullPage: false });

  await browser.close();
})();
