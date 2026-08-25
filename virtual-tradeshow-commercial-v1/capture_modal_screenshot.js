const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://v-show-commercial-v1-production.up.railway.app/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));

  // Open modal via client function
  await page.evaluate(() => {
    openEmailVerifyModal('contact@innovations.com');
  });
  await new Promise(r => setTimeout(r, 800));

  const screenshotPath = 'C:/Users/vivPR/.gemini/antigravity/brain/9afb9fd9-3f7d-4d23-9c77-091fbc3ca5d8/DNA_C10R3_MAGIC_LINK_MODAL.png';
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot to:', screenshotPath);

  await browser.close();
})();
